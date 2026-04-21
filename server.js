const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

let db = {
    painel: { nome: "Gabriel Star Store", desc: "Bem-vindo!", banner: null },
    produtos: [], // Aqui guardamos nome, valor, qtd e descrição
    chavePix: "Não definida",
    msgPainelId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Envia o painel da loja')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. ENVIAR PAINEL VITRINE
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setDescription(db.painel.desc)
                .setColor("#00ff6a")
                .setImage(db.painel.banner || null);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('configurar_loja').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. CONFIGURAR (AGORA COM PIX, VALOR E DESCRIÇÃO)
        if (i.isButton() && i.customId === 'configurar_loja') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Acesso negado.", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_setup').setTitle('Configuração Gabriel Star');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Sua Chave PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('Produto: Nome + Emoji').setStyle(TextInputStyle.Short).setPlaceholder("Ex: Conta FF 🔥")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_valor').setLabel('Valor do Produto').setStyle(TextInputStyle.Short).setPlaceholder("Ex: R$ 50,00")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_qtd').setLabel('Quantidade em Estoque').setStyle(TextInputStyle.Short).setPlaceholder("Ex: 15")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_desc').setLabel('Descrição Detalhada (FDD)').setStyle(TextInputStyle.Paragraph))
            );
            return await i.showModal(modal);
        }

        if (i.isModalSubmit() && i.customId === 'm_setup') {
            db.chavePix = i.fields.getTextInputValue('pix');
            const pNome = i.fields.getTextInputValue('p_nome');
            const pValor = i.fields.getTextInputValue('p_valor');
            const pQtd = i.fields.getTextInputValue('p_qtd');
            const pDesc = i.fields.getTextInputValue('p_desc');

            if (pNome) {
                db.produtos.push({ nome: pNome, preco: pValor, qtd: pQtd, desc: pDesc });
            }

            await i.reply({ content: "✅ Configurações e Produto salvos com sucesso!", ephemeral: true });
        }

        // 3. VER OPÇÕES
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Sem produtos cadastrados.", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('comprar').setPlaceholder('Selecione um item...')
                    .addOptions(db.produtos.map((p, index) => ({ 
                        label: p.nome, 
                        description: `Valor: ${p.preco} | Estoque: ${p.qtd}`, 
                        value: index.toString() 
                    })))
            );
            await i.reply({ content: "Escolha o que deseja comprar:", components: [menu], ephemeral: true });
        }

        // 4. CRIAR TICKET (COM REVISÃO FDD E VALOR)
        if (i.isStringSelectMenu() && i.customId === 'comprar') {
            const prod = db.produtos[parseInt(i.values[0])];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle("📋 Revisão do Pedido")
                .setDescription(`**Produto:** ${prod.nome}\n**Valor:** \`${prod.preco}\`\n**Estoque:** ${prod.qtd}\n\n**Descrição:**\n${prod.desc}`)
                .setColor("#5865F2");

            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ir_pagar').setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar Compra').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Staff Sirius`, embeds: [embed], components: [btns] });
            await i.update({ content: `✅ Ticket criado: ${canal}`, components: [] });
        }

        // 5. PAGAMENTO (COM CHAVE PIX COPIA E COLA)
        if (i.isButton() && i.customId === 'ir_pagar') {
            const pixEmbed = new EmbedBuilder()
                .setTitle("🤑 Pagamento via PIX")
                .setDescription(`Para finalizar, realize o pagamento na chave abaixo:\n\n**Chave PIX:**\n\`${db.chavePix}\`\n\n*Após pagar, envie o comprovante e aguarde um vendedor.*`)
                .setColor("#00ff6a");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirmar_pago').setLabel('Confirmar Pagamento').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );

            await i.update({ embeds: [pixEmbed], components: [row] });
        }

        // 6. CONFIRMAR (TICKET FICA ABERTO PARA ENTREGA)
        if (i.isButton() && i.customId === 'confirmar_pago') {
            if (!i.member.roles.cache.has(cargoVend.id) && !i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Apenas a Staff pode confirmar.", ephemeral: true });
            
            await i.reply({ content: "✅ **Pagamento Confirmado!**\nO vendedor enviará o produto agora. Por favor, aguarde." });
        }

        // 7. FECHAR TICKET
        if (i.isButton() && i.customId === 'cancelar') {
            await i.channel.delete().catch(() => {});
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
